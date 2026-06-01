const REQUIRED_ENV_BY_PROVIDER = {
  plaid: ["PLAID_CLIENT_ID", "PLAID_SECRET"],
  gocardless: ["GOCARDLESS_SECRET_ID", "GOCARDLESS_SECRET_KEY"],
  enablebanking: [
    "ENABLEBANKING_APPLICATION_ID",
    "ENABLE_BANKING_KEY_CONTENT",
    "ENABLEBANKING_REDIRECT_URL",
  ],
  teller: ["TELLER_CERT_BASE64", "TELLER_KEY_BASE64"],
} as const;

export type BankingProviderId = keyof typeof REQUIRED_ENV_BY_PROVIDER;

export type BankingProviderConfigurationStatus = {
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

export function getBankingProviderConfigurationStatuses(): Record<
  BankingProviderId,
  BankingProviderConfigurationStatus
> {
  return Object.fromEntries(
    Object.entries(REQUIRED_ENV_BY_PROVIDER).map(([provider, envVars]) => {
      const missingEnvVars = envVars.filter(
        (envVar) => !hasValue(process.env[envVar]),
      );

      return [
        provider,
        {
          active: missingEnvVars.length === 0,
          missingEnvVars,
        },
      ];
    }),
  ) as Record<BankingProviderId, BankingProviderConfigurationStatus>;
}
