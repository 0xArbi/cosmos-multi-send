import { Stack } from "@chakra-ui/react";
import { ChainName } from "@cosmos-kit/core";
import { useWallet } from "@cosmos-kit/react";
import { MouseEventHandler, useEffect } from "react";
import {
  Connected,
  ConnectedShowAddress,
  Connecting,
  CopyAddressBtn,
  Disconnected,
  Error,
  NotExist,
  Rejected,
  WalletConnectComponent,
} from "../components";

export const WalletSection = ({ chainName }: { chainName?: ChainName }) => {
  const walletManager = useWallet();
  const {
    connect,
    openView,
    setCurrentChain,
    walletStatus,
    address,
    currentWalletName,
  } = walletManager;

  useEffect(() => {
    setCurrentChain(chainName);
  }, [chainName, setCurrentChain]);

  // Events
  const onClickConnect: MouseEventHandler = async (e) => {
    e.preventDefault();
    openView();
    if (currentWalletName) {
      connect();
    }
  };

  const onClickOpenView: MouseEventHandler = (e) => {
    e.preventDefault();
    openView();
  };

  // Components
  const connectWalletButton = (
    <WalletConnectComponent
      walletStatus={walletStatus}
      disconnect={
        <Disconnected buttonText="Connect Wallet" onClick={onClickConnect} />
      }
      connecting={<Connecting />}
      connected={
        <Connected buttonText={"My Wallet"} onClick={onClickOpenView} />
      }
      rejected={<Rejected buttonText="Reconnect" onClick={onClickConnect} />}
      error={<Error buttonText="Change Wallet" onClick={onClickOpenView} />}
      notExist={
        <NotExist buttonText="Install Wallet" onClick={onClickOpenView} />
      }
    />
  );

  const addressBtn = chainName && (
    <CopyAddressBtn
      walletStatus={walletStatus}
      connected={<ConnectedShowAddress address={address} isLoading={false} />}
    />
  );

  return (
    <Stack direction="row" align="center" spacing={4}>
      {addressBtn}
      {connectWalletButton}
    </Stack>
  );
};
