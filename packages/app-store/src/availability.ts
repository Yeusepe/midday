const REQUIRED_ENV_BY_APP_ID = {
  gmail: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REDIRECT_URI"],
  outlook: [
    "OUTLOOK_CLIENT_ID",
    "OUTLOOK_CLIENT_SECRET",
    "OUTLOOK_REDIRECT_URI",
  ],
  slack: [
    "SLACK_CLIENT_ID",
    "SLACK_CLIENT_SECRET",
    "SLACK_OAUTH_REDIRECT_URL",
    "SLACK_STATE_SECRET",
  ],
  xero: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_OAUTH_REDIRECT_URL"],
  quickbooks: [
    "QUICKBOOKS_CLIENT_ID",
    "QUICKBOOKS_CLIENT_SECRET",
    "QUICKBOOKS_OAUTH_REDIRECT_URL",
  ],
  fortnox: [
    "FORTNOX_CLIENT_ID",
    "FORTNOX_CLIENT_SECRET",
    "FORTNOX_OAUTH_REDIRECT_URL",
  ],
  "stripe-payments": ["STRIPE_SECRET_KEY", "STRIPE_CONNECT_CLIENT_ID"],
  telegram: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME"],
  whatsapp: [
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_VERIFY_TOKEN",
  ],
  sendblue: ["SENDBLUE_API_KEY", "SENDBLUE_API_SECRET", "SENDBLUE_FROM_NUMBER"],
} as const;

export type ConfiguredAppId = keyof typeof REQUIRED_ENV_BY_APP_ID;

export type AppConfigurationStatus = {
  active: boolean;
  missingEnvVars: string[];
};

function hasValue(value: string | undefined): boolean {
  if (!value) return false;

  const normalized = value.trim().toLowerCase();

  return (
    normalized.length > 0 &&
    !normalized.startsWith("<your-") &&
    !normalized.startsWith("your_")
  );
}

export function getAppConfigurationStatuses(): Record<
  ConfiguredAppId,
  AppConfigurationStatus
> {
  return Object.fromEntries(
    Object.entries(REQUIRED_ENV_BY_APP_ID).map(([appId, envVars]) => {
      const missingEnvVars = envVars.filter(
        (envVar) => !hasValue(process.env[envVar]),
      );

      return [
        appId,
        {
          active: missingEnvVars.length === 0,
          missingEnvVars,
        },
      ];
    }),
  ) as Record<ConfiguredAppId, AppConfigurationStatus>;
}
