// « Brancher une IA » simulé pour les parcours : la clé de branchement est gardée en mémoire ;
// `connection=key` dans l'adresse en donne une dès le départ.
import type { ConnectionInfo, ConnectionKeyItem } from "../src/bridge";

type Handler = (args: Record<string, unknown>) => unknown;

/** La partie de la doublure qui tient la clé de branchement. */
export interface FakeConnection {
  connection: {
    key: ConnectionKeyItem | null;
    /** Combien de clés ont été créées, et combien révoquées. */
    created: number;
    revoked: number;
  };
}

const PROGRAM = "/Applications/MALOREAN Notes.app/Contents/MacOS/malorean-notes";

function keyItem(number: number): ConnectionKeyItem {
  const secret = `cle-de-branchement-${number}`;
  return {
    secret,
    createdOn: "25 novembre 2026",
    claudeConfig: `{\n  "mcpServers": {\n    "malorean_notes": {\n      "command": "${PROGRAM}",\n      "args": ["--brancher", "${secret}"]\n    }\n  }\n}`,
    codexConfig: `[mcp_servers.malorean_notes]\ncommand = "${PROGRAM}"\nargs = ["--brancher", "${secret}"]`,
  };
}

export function fakeConnectionState(params: URLSearchParams): FakeConnection {
  const withKey = params.get("connection") === "key";
  return { connection: { key: withKey ? keyItem(1) : null, created: withKey ? 1 : 0, revoked: 0 } };
}

export function fakeConnectionCommands(backend: FakeConnection): Record<string, Handler> {
  const info = (): ConnectionInfo => ({ key: backend.connection.key });
  return {
    connection_info: info,
    create_connection_key: () => {
      backend.connection.key ??= keyItem(++backend.connection.created);
      return info();
    },
    revoke_connection_key: () => {
      backend.connection.key = null;
      backend.connection.revoked += 1;
      return null;
    },
  };
}
