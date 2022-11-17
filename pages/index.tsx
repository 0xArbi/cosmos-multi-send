import { Asset, AssetList } from "@chain-registry/types";
import {
  Box,
  Button,
  Container,
  Flex,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { StdFee } from "@cosmjs/amino";
import { fromBech32 } from "@cosmjs/encoding";
import { useWallet } from "@cosmos-kit/react";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/solid";
import BigNumber from "bignumber.js";
import { assets as allAssets, chains as allChains } from "chain-registry";
import { cosmos } from "juno-network";
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import SelectSearch from "react-select-search";
import "react-select-search/style.css";

import { WalletSection } from "../components";

const FILTERED_CHAINS = [
  "avalanche",
  "polkadot",
  "ethereum",
  "moonbeam",
  "polygon",
  "terra",
  "binancesmartchain",
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
  return toBaseDirect(amount, exp);
}

function toBaseDirect(amount: string, decimals: number) {
  const a = new BigNumber(amount);
  return a.multipliedBy(10 ** decimals).toString();
}

export default function Home() {
  const {
    getStargateClient,
    address,
    setCurrentChain,
    currentWallet,
    currentChainName,
    connect,
    getCosmWasmClient,
  } = useWallet();

  const [search, setSearch] = useState("");
  const asset = useMemo(() => {
    for (const chain of assets) {
      for (const asset of chain.assets) {
        if (search === assetId(chain, asset)) {
          const c = allChains.find((x) => x.chain_name === chain.chain_name)!;
          return { chain: c, asset };
        }
      }
    }
  }, [search]);
  const [recipients, setRecipients] = useState([{ address: "", amount: "" }]);
  const [balance, setBalance] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (asset) {
      setCurrentChain(asset.chain.chain_name);
      connect();
    } else {
      setCurrentChain("juno");
    }
  }, [asset]);

  useEffect(() => {
    async function getBalance() {
      if (!currentWallet || !asset || !getStargateClient) {
        return;
      }

      if (!asset?.asset.address) {
        console.log("getting client (no address)");
        let rpcEndpoint = await currentWallet?.getRpcEndpoint();
        if (!rpcEndpoint) {
          console.log("no rpc endpoint — using a fallback");
          rpcEndpoint = `https://rpc.cosmos.directory/${asset.chain.chain_name}`;
        }
        console.log("got rpc");
        // get RPC client
        const client = await cosmos.ClientFactory.createRPCQueryClient({
          rpcEndpoint,
        });
        console.log("got client");

        const balance = await client.cosmos.bank.v1beta1.balance({
          address: currentWallet.address,
          denom: asset.asset.base,
        });

        setBalance(fromBase(balance.balance.amount, asset.asset));
      } else if (asset.asset.address) {
        console.log("getting wasm client", currentWallet);
        const client = await getCosmWasmClient();
        console.log("got wasm client");
        const result = await client?.queryContractSmart(asset.asset.address, {
          balance: { address: currentWallet.address },
        });
        console.log(result);
        if (!result) {
          return;
        }

        setBalance(fromBase(result.balance, asset.asset));
      }
    }

    getBalance().catch((e) => {
      setBalance("0");
    });
  }, [currentWallet, asset, getStargateClient, getCosmWasmClient]);

  const sendTokens = async () => {
    if (!asset || !currentWallet) {
      return;
    }

    try {
      setSubmitting(true);

      const nativeAsset = allAssets.find(
        (x) => x.chain_name === asset.chain.chain_name
      )?.assets[0].denom_units[1].denom;
      const gasDenom = asset.chain.fees?.fee_tokens[0].denom;
      const gasAmount =
        asset.chain.fees?.fee_tokens[0].average_gas_price ?? "0";

      const denom = gasDenom || nativeAsset;

      const fee: StdFee = {
        gas: (
          (asset.asset.address ? 160_000 : 200_000) * recipients.length
        ).toString(),
        amount: [
          {
            amount: toBaseDirect(gasAmount.toString(), 6),
            denom: denom!,
          },
        ],
      };

      let transactionHash: string | null = null;
      if (!asset.asset.address) {
        const stargateClient = await getStargateClient();
        if (!stargateClient || !address) {
          throw new Error("Unable to get wallet");
        }

        const messages = recipients.map(({ address, amount }) =>
          cosmos.bank.v1beta1.MessageComposer.withTypeUrl.send({
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

        const result = await stargateClient.signAndBroadcast(
          address,
          messages,
          fee
        );
        transactionHash = result.transactionHash;
      } else {
        const client = await getCosmWasmClient();
        if (!client) {
          throw new Error("unable to connect to network");
        }

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
          fee
        );
        transactionHash = result.transactionHash;
      }
      if (transactionHash) {
        const link = (
          asset.chain.explorers?.find((x) => x.kind === "mintscan") ??
          asset.chain.explorers?.[0]
        )?.tx_page?.replace("${txHash}", transactionHash);
        toast.success(
          <div className="flex items-center space-x-2">
            <span>Funds sent</span>
            {link && (
              <a
                className="underline text-blue-500 cursor-pointer"
                href={link}
                target="_blank"
                rel="noreferrer"
              >
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </a>
            )}
          </div>
        );
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const total = recipients.reduce(
    (total, x) => total + parseFloat(x.amount || "0"),
    0
  );
  const invalidTotal = total > parseFloat(balance);

  return (
    <Container maxW="2xl" py={10}>
      <Head>
        <title>multi-send</title>
        <meta
          name="description"
          content="Bulk token disbursement tool for Cosmos app chains"
        />
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
            recipients, works with CW20 tokens as well as native assets.
          </Text>
          <a
            href="https://github.com/0xArbi/cosmos-multi-send"
            target="_blank"
            rel="noreferrer"
            style={{ width: "fit-content" }}
          >
            <Text fontSize="sm">Open sourced on Github.</Text>
          </a>
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
              {recipients.map(({ address, amount }, index) => {
                let validAddress = true;
                try {
                  if (address && asset) {
                    validAddress =
                      fromBech32(address).prefix == asset?.chain.bech32_prefix;
                  }
                } catch {
                  validAddress = false;
                }
                let validAmount = !amount || !isNaN(parseFloat(amount));
                return (
                  <Flex gap={4} mb={2} key={`input-${index}`}>
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
                      backgroundColor="white"
                      borderColor={validAddress ? undefined : "red"}
                    />
                    <Input
                      placeholder="Amount"
                      value={amount}
                      backgroundColor="white"
                      onChange={(e) =>
                        setRecipients((o) =>
                          o.map((x, i) =>
                            i === index ? { ...x, amount: e.target.value } : x
                          )
                        )
                      }
                      borderColor={validAmount ? undefined : "red"}
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
                );
              })}
              <Stack direction="row" justify="flex-end" align="center">
                <Input
                  pt={1}
                  type="file"
                  size="sm"
                  placeholder="CSV file"
                  maxWidth={240}
                  border={"hidden"}
                  onChange={(e) => {
                    e.preventDefault();
                    if (!e?.target?.files?.[0]) {
                      return;
                    }

                    const fileReader = new FileReader();
                    fileReader.onload = function (event) {
                      const csvOutput = event.target?.result;
                      if (!csvOutput || typeof csvOutput !== "string") {
                        return;
                      }

                      const rows = csvOutput
                        .split("\n")
                        .map((x) => x.split(","));
                      setRecipients((r) => [
                        ...r.filter((x) => x.address && x.amount),
                        ...rows.map(([address, amount]) => ({
                          address,
                          amount,
                        })),
                      ]);
                    };

                    fileReader.readAsText(e.target.files[0]);
                  }}
                  accept=".csv"
                />
                <Button
                  alignSelf="flex-end"
                  onClick={() =>
                    setRecipients((o) => [...o, { address: "", amount: "" }])
                  }
                >
                  New Recipient
                </Button>
              </Stack>
            </Stack>
          </Flex>

          <Stack>
            {asset && (
              <Stack direction="row" justify="space-between">
                <Text fontWeight="medium">Balance</Text>
                <Text>{`${balance} ${asset?.asset.symbol}`}</Text>
              </Stack>
            )}

            <Stack direction="row" justify="space-between">
              <Text fontWeight="medium">Total</Text>
              <Text color={invalidTotal ? "red" : ""}>
                {total} {asset?.asset.symbol}
              </Text>
            </Stack>
          </Stack>

          <Button
            onClick={sendTokens}
            disabled={!currentWallet || invalidTotal || submitting}
            isLoading={submitting}
          >
            Submit
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
