import { Asset, AssetList } from "@chain-registry/types";
import { StdFee } from "@cosmjs/amino";
import { useWallet } from "@cosmos-kit/react";
import BigNumber from "bignumber.js";
import { assets as allAssets } from "chain-registry";
import { useEffect, useMemo, useState } from "react";
import SelectSearch from "react-select-search";
import "react-select-search/style.css";

import {
  Box,
  Button,
  Container,
  Flex,
  Input,
  Stack,
  Text,
  useToast,
} from "@chakra-ui/react";

import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { cosmos } from "juno-network";
import Head from "next/head";
import { WalletSection } from "../components";

const FILTERED_CHAINS = [
  "avalanche",
  "polkadot",
  "ethereum",
  "moonbeam",
  "polygon",
  "terra",
];
const assets = allAssets.filter(
  (x) =>
    !FILTERED_CHAINS.includes(x.chain_name) &&
    !x.chain_name?.includes("testnet")
);

const assetId = (chain: AssetList, asset: Asset) => {
  const address =
    asset.address ?? asset.traces?.[0]?.counterparty?.base_denom ?? asset.base;
  return `${chain.chain_name}-${address}`;
};

function fromBase(amount: string, asset: Asset) {
  const exp = asset.denom_units.find((unit) => unit.denom === asset.display)
    ?.exponent as number;

  const a = new BigNumber(amount);
  return a.multipliedBy(10 ** -exp).toString();
}

function toBase(amount: string, asset: Asset) {
  const exp = asset.denom_units.find((unit) => unit.denom === asset.display)
    ?.exponent as number;

  const a = new BigNumber(amount);
  console.log("toBase", amount, a.multipliedBy(10 ** exp).toString());
  return a.multipliedBy(10 ** exp).toString();
}

export default function Home() {
  const {
    getStargateClient,
    address,
    setCurrentChain,
    currentWallet,
    currentChainName,
    connect,
    update,
    getCosmWasmClient,
  } = useWallet();

  const [search, setSearch] = useState("");
  const asset = useMemo(() => {
    for (const chain of assets) {
      for (const asset of chain.assets) {
        if (search === assetId(chain, asset)) {
          return { chain, asset };
        }
      }
    }
  }, [search]);
  const [recipients, setRecipients] = useState([{ address: "", amount: "" }]);
  const [balance, setBalance] = useState("0");
  const toast = useToast();

  useEffect(() => {
    if (asset) {
      setCurrentChain(asset.chain.chain_name);
      connect();
      update();
    }
  }, [asset]);

  useEffect(() => {
    async function getBalance() {
      if (!currentWallet || !asset || !getStargateClient) {
        return;
      }

      if (!asset?.asset.address) {
        let rpcEndpoint = await currentWallet?.getRpcEndpoint();
        if (!rpcEndpoint) {
          console.log("no rpc endpoint — using a fallback");
          rpcEndpoint = `https://rpc.cosmos.directory/${asset.chain.chain_name}`;
        }

        // get RPC client
        const client = await cosmos.ClientFactory.createRPCQueryClient({
          rpcEndpoint,
        });

        // fetch balance
        const balance = await client.cosmos.bank.v1beta1.balance({
          address: currentWallet.address,
          denom: asset.asset.base,
        });

        setBalance(fromBase(balance.balance.amount, asset.asset));
      } else if (asset.asset.address) {
        const client = await getCosmWasmClient();
        console.log(asset.asset.address, {
          balance: { address: currentWallet.address },
        });
        const result = await client?.queryContractSmart(asset.asset.address, {
          balance: { address: currentWallet.address },
        });
        if (!result) {
          return;
        }

        setBalance(fromBase(result.balance, asset.asset));
      }
    }

    getBalance().catch((e) => {
      console.log(e);
      setBalance("0");
    });
  }, [currentWallet, asset, getStargateClient]);

  const sendTokens = async () => {
    if (!asset || !currentWallet) {
      return;
    }

    if (!asset.asset.address) {
      const stargateClient = await getStargateClient();
      if (!stargateClient || !address) {
        console.error("stargateClient undefined or address undefined.");
        return;
      }

      const { send } = cosmos.bank.v1beta1.MessageComposer.withTypeUrl;

      const messages = recipients.map(({ address, amount }) =>
        send({
          amount: [
            {
              denom: asset.asset.base,
              amount: toBase(amount, asset.asset),
            },
          ],
          toAddress: address,
          fromAddress: currentWallet.address,
        })
      );

      const fee: StdFee = {
        amount: [
          {
            denom: asset.asset.base,
            amount: "2000",
          },
        ],
        gas: (30_000 * messages.length).toString(),
      };

      const response = await stargateClient.signAndBroadcast(
        address,
        messages,
        fee
      );
      toast({
        title: "Funds sent",
        status: "success",
        description: `https://mintscan.io/${asset.chain.chain_name}/${response.transactionHash}`,
      });
    } else {
      const client: SigningCosmWasmClient =
        await currentWallet.getCosmWasmClient();

      const fee: StdFee = {
        amount: [
          {
            denom: asset.asset.base,
            amount: "2000",
          },
        ],
        gas: (120_000 * recipients.length).toString(),
      };
      const result = await client.executeMultiple(
        currentWallet.address,
        recipients.map(({ address, amount }) => ({
          contractAddress: asset.asset.address!,
          msg: {
            transfer: {
              recipient: address,
              amount: toBase(amount, asset.asset),
            },
          },
        })),
        fee,
        "auto"
      );
      toast({
        status: "success",
        title: "Funds sent",
        description: `https://mintscan.io/${asset.chain.chain_name}/${result.transactionHash}`,
      });
    }
  };

  return (
    <Container maxW="2xl" py={10}>
      <Head>
        <title>Multi Send</title>
        <meta name="description" content="Generated by create cosmos app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Stack spacing={8}>
        <Box alignSelf="flex-end">
          <WalletSection chainName={currentChainName} />
        </Box>

        <Stack spacing={2}>
          <Text fontSize="4xl" fontWeight="extrabold">
            Cosmos Multi Send
          </Text>

          <Text>
            A utility tool for transferring tokens to a large number of
            recipients. Works with CW20 tokens as well as native assets.
          </Text>
        </Stack>

        <Stack gap={4}>
          <Stack gap={0} direction="row" justify="space-between" align="center">
            <Text fontWeight="medium">Send</Text>
            <Stack>
              <SelectSearch
                options={assets.map((list) => ({
                  type: "group",
                  name: list.chain_name,
                  items: list.assets.map((a) => ({
                    name: `${a.name} (${a.symbol})`,
                    value: assetId(list, a),
                  })),
                }))}
                search
                placeholder="Pick your token"
                onChange={(e) => setSearch(e.toString())}
              />
            </Stack>
          </Stack>

          <Flex direction="column">
            <Stack gap={0}>
              <Text fontWeight="medium">Recipients</Text>
              {recipients.map(({ address, amount }, index) => (
                <Flex gap={4} mb={2} key={address}>
                  <Input
                    placeholder="Address"
                    value={address}
                    onChange={(e) =>
                      setRecipients((o) =>
                        o.map((x, i) =>
                          i === index ? { ...x, address: e.target.value } : x
                        )
                      )
                    }
                  />
                  <Input
                    placeholder="Amount"
                    value={amount}
                    onChange={(e) =>
                      setRecipients((o) =>
                        o.map((x, i) =>
                          i === index ? { ...x, amount: e.target.value } : x
                        )
                      )
                    }
                  />
                  <Button
                    onClick={() =>
                      setRecipients((o) =>
                        o.filter((_, i) => (i === index ? false : true))
                      )
                    }
                    disabled={recipients.length === 1}
                  >
                    X
                  </Button>
                </Flex>
              ))}
              <Button
                alignSelf="flex-end"
                onClick={() =>
                  setRecipients((o) => [...o, { address: "", amount: "" }])
                }
              >
                New Recipient
              </Button>
            </Stack>
          </Flex>

          {asset && (
            <Stack direction="row" justify="space-between">
              <Text fontWeight="medium">Balance</Text>
              <Text>{`${balance} ${asset?.asset.symbol}`}</Text>
            </Stack>
          )}

          <Stack direction="row" justify="space-between">
            <Text fontWeight="medium">Total</Text>
            <Text>
              {recipients.reduce(
                (total, x) => total + parseFloat(x.amount || "0"),
                0
              )}{" "}
              {asset?.asset.symbol}
            </Text>
          </Stack>

          <Button onClick={sendTokens} disabled={!currentWallet}>
            Submit
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
