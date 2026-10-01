import { createRoot } from "react-dom/client";
import { UserManager } from "oidc-client-ts";
import "virtual:geomap-tokens.css";
import "./ui/ui.css";
import "./index.css";
import { loadConfig } from "./auth/config";
import { AuthProvider, CALLBACK_PATH } from "./auth/AuthProvider";
import { App } from "./App";

const root = createRoot(document.getElementById("root")!);

// No StrictMode: its double effect run would redeem the one-time authorization code twice.
loadConfig().then(
  (config) => {
    const manager = new UserManager({
      authority: config.oidcAuthority,
      client_id: config.oidcClientId,
      redirect_uri: location.origin + CALLBACK_PATH,
      post_logout_redirect_uri: location.origin + "/",
      response_type: "code",
      scope: "openid profile",
      automaticSilentRenew: true,
    });
    root.render(
      <AuthProvider manager={manager}>
        <App />
      </AuthProvider>,
    );
  },
  (error: unknown) => root.render(<p role="alert">{String(error)}</p>),
);
