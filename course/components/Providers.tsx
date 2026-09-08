"use client";

import { BackendProvider } from "@/components/backend/BackendProvider";
import { DataSourceProvider } from "@/data/DataSourceProvider";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { ExperimentProvider } from "@/lib/experiments/store";
import { HotkeysProvider } from "@/lib/hotkeys";
import { ThemeProvider } from "@/lib/theme";

export function Providers({ locale, dictionary, children }: { locale: Locale; dictionary: Dictionary; children: React.ReactNode }) {
  return (
    <I18nProvider locale={locale} dictionary={dictionary}>
      <ThemeProvider>
        <HotkeysProvider>
          <BackendProvider>
            <DataSourceProvider>
              <ExperimentProvider>{children}</ExperimentProvider>
            </DataSourceProvider>
          </BackendProvider>
        </HotkeysProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
