import { useState } from "react";

import { AccountScreen } from "./screens/AccountScreen";
import { ProfileScreen } from "./screens/ProfileScreen";

const REPOSITORY_URL = "https://github.com/axtew/draftform";

const TABS = [
  { id: "profile", title: "Profile with autosave", Screen: ProfileScreen },
  { id: "account", title: "Sign in and sign up", Screen: AccountScreen },
] as const;

type Tab = (typeof TABS)[number]["id"];

export function App() {
  const [tab, setTab] = useState<Tab>("profile");

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <h1>draftform</h1>
          <nav className="links">
            <a href={REPOSITORY_URL}>GitHub</a>
          </nav>
        </div>
        <p className="tagline">
          A small React hook for flat forms: knows which values are saved, submits only changes,
          autosaves without races.
        </p>
        <p className="hint">
          Everything runs in your browser: the servers are functions in the page with a delay.
        </p>
      </header>
      <nav className="tabs" aria-label="Screens">
        {TABS.map(({ id, title }) => (
          <button
            key={id}
            type="button"
            aria-current={id === tab ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            {title}
          </button>
        ))}
      </nav>
      <main>
        {/* Hidden, not unmounted: the profile form keeps its state across tabs. */}
        {TABS.map(({ id, Screen }) => (
          <div key={id} hidden={id !== tab}>
            <Screen />
          </div>
        ))}
      </main>
      <footer className="footer">
        The page and its fake servers: <a href={`${REPOSITORY_URL}/tree/main/example`}>example/</a>
      </footer>
    </div>
  );
}
