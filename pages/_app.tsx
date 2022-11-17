import { ChakraProvider } from "@chakra-ui/react";
import { wallets } from "@cosmos-kit/keplr";
import { WalletProvider } from "@cosmos-kit/react";
import { assets, chains } from "chain-registry";
import type { AppProps } from "next/app";
import { defaultTheme } from "../config";
import "../styles.css";
import { Toaster } from "react-hot-toast";

function CreateCosmosApp({ Component, pageProps }: AppProps) {
  return (
    <ChakraProvider theme={defaultTheme}>
      <WalletProvider chains={chains} assetLists={assets} wallets={wallets}>
        <Component {...pageProps} />
        <Toaster />
      </WalletProvider>
    </ChakraProvider>
  );
}

export default CreateCosmosApp;
