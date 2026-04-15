import { http, createConfig } from "wagmi";
import { base, arbitrum, optimism, polygon, mainnet } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [base, arbitrum, optimism, polygon, mainnet],
  transports: {
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [mainnet.id]: http(),
  },
});
