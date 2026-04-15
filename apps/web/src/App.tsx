import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProviders } from "./lib/privy.tsx";
// import { NavBar } from "./components/NavBar.tsx";
import { AuthGuard } from "./components/AuthGuard.tsx";
import { Onboard } from "./pages/Onboard.tsx";
import { Discover } from "./pages/Discover.tsx";
import { Portfolio } from "./pages/Portfolio.tsx";
import { VaultDetail } from "./pages/VaultDetail.tsx";
import { Experiment } from "./pages/Experiment.tsx";

export function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        {/* <NavBar /> */}
        <Routes>
          <Route path="/" element={<Onboard />} />
          <Route path="/experiment" element={<Experiment />} />
          <Route
            path="/discover"
            element={
              <AuthGuard>
                <Discover />
              </AuthGuard>
            }
          />
          <Route
            path="/vault/:slug"
            element={
              <AuthGuard>
                <VaultDetail />
              </AuthGuard>
            }
          />
          <Route
            path="/portfolio"
            element={
              <AuthGuard>
                <Portfolio />
              </AuthGuard>
            }
          />
        </Routes>
      </BrowserRouter>
    </AppProviders>
  );
}
