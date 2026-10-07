import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { PublicSettings } from '../lib/api';

const defaults: PublicSettings = {
  site_name: 'AI Video Studio',
  logo_url: null,
  currency: 'USD',
  registration_enabled: true,
  maintenance_mode: false,
};

const Ctx = createContext<PublicSettings>(defaults);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings>(defaults);

  useEffect(() => {
    let alive = true;
    api<PublicSettings>('/api/settings/public')
      .then((s) => {
        if (alive) setSettings(s);
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    document.title = `${settings.site_name} — AI Video Generator`;
  }, [settings.site_name]);

  return <Ctx.Provider value={settings}>{children}</Ctx.Provider>;
}

export function useSettings() {
  return useContext(Ctx);
}
