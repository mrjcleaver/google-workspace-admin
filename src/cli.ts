export interface CliArgs {
  forwardingInput?: string;
  usersInput?: string;
  outDir: string;
  csvOut?: string;
  markdownOut?: string;
  webhook?: string;
  webhookFlavor: "slack" | "discord" | "auto";
  sheetId?: string;
  sheetName?: string;
  allowedDomains: string[];
  exemptAdmins: boolean;
  exemptSuspended: boolean;
  unreachableAfterDays: number;
  fullOrgPath: boolean;
  includeSubOus: boolean;
  dryRun: boolean;
  help: boolean;
}

const HELP = `gws-audit — Google Workspace forwarding compliance audit

Usage:
  gws-audit [options]

Input (auto-detected; if neither flag is given, shells out to \`gam\`):
  --forwarding-input <path>   Pre-fetched forwardingaddresses CSV
  --users-input <path>        Pre-fetched users CSV (needed to detect users with NO forwarding)

Output:
  --out-dir <dir>             Directory for generated reports (default: ./out)
  --csv <path>                Override CSV report path
  --markdown <path>           Override markdown summary path

Sheets (FR2):
  --sheet-id <id>             Google Sheet ID to write report into
  --sheet-name <name>         Tab name (default: "Forwarding Audit")
                              Auth via GOOGLE_APPLICATION_CREDENTIALS or
                              GOOGLE_SERVICE_ACCOUNT_JSON env var.

Webhook (FR4):
  --webhook <url>             Slack or Discord webhook URL
  --webhook-flavor <kind>     slack | discord | auto (default: auto)

Compliance policy:
  --allowed-domain <domain>   Restrict forwarding targets (repeatable)
  --no-exempt-admins          Don't exempt admin users (PRD: admins are exempt by default)
  --no-exempt-suspended       Don't exempt suspended users
  --unreachable-after-days N  Days since last login that marks a dormant user
                              unreachable when no working forwarding (default: 28)
  --full-org-path             Render the user's full orgUnitPath in the
                              \`organization\` column. Default: top-level OU only.
  --include-sub-ous           Audit users in sub-OUs in addition to the root
                              OU. Default: only users at orgUnitPath \`/\`.

Other:
  --dry-run                   Print summary, write no files, post no webhook
  -h, --help                  Show this help

Environment:
  GAM_PATH                    Path to gam binary (default: \`gam\` on PATH)
  GOOGLE_APPLICATION_CREDENTIALS  Path to service account JSON for Sheets
  GOOGLE_SERVICE_ACCOUNT_JSON     Inline service account JSON for Sheets
`;

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    outDir: "out",
    webhookFlavor: "auto",
    allowedDomains: [],
    exemptAdmins: true,
    exemptSuspended: true,
    unreachableAfterDays: 28,
    fullOrgPath: false,
    includeSubOus: false,
    dryRun: false,
    help: false,
  };

  const need = (flag: string, v: string | undefined): string => {
    if (v === undefined) throw new Error(`${flag} requires a value`);
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "--forwarding-input":
        args.forwardingInput = need(a, next());
        break;
      case "--users-input":
        args.usersInput = need(a, next());
        break;
      case "--out-dir":
        args.outDir = need(a, next());
        break;
      case "--csv":
        args.csvOut = need(a, next());
        break;
      case "--markdown":
        args.markdownOut = need(a, next());
        break;
      case "--sheet-id":
        args.sheetId = need(a, next());
        break;
      case "--sheet-name":
        args.sheetName = need(a, next());
        break;
      case "--webhook":
        args.webhook = need(a, next());
        break;
      case "--webhook-flavor": {
        const v = need(a, next());
        if (v !== "slack" && v !== "discord" && v !== "auto")
          throw new Error(`--webhook-flavor must be slack|discord|auto, got ${v}`);
        args.webhookFlavor = v;
        break;
      }
      case "--allowed-domain":
        args.allowedDomains.push(need(a, next()));
        break;
      case "--no-exempt-admins":
        args.exemptAdmins = false;
        break;
      case "--no-exempt-suspended":
        args.exemptSuspended = false;
        break;
      case "--full-org-path":
        args.fullOrgPath = true;
        break;
      case "--include-sub-ous":
        args.includeSubOus = true;
        break;
      case "--unreachable-after-days": {
        const v = need(a, next());
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) throw new Error(`${a} expects a non-negative integer, got ${v}`);
        args.unreachableAfterDays = n;
        break;
      }
      case "--dry-run":
        args.dryRun = true;
        break;
      default:
        throw new Error(`unknown argument: ${a}`);
    }
  }
  return args;
}

export function helpText(): string {
  return HELP;
}
