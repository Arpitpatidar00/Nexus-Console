import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import {
  setTheme,
  setLayout,
  setEnabledModules,
  setGlobalHotkey,
} from '@/shared/state/settingsSlice';
import { Button } from '@/shared/ui/Button';
import { useEnabledModules } from '@/shared/modules';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Panel } from '@/shared/ui/Panel';
import { FeaturePicker } from '@/features/settings/components/FeaturePicker';
import { HomebrewStatusCard } from '@/features/settings/components/HomebrewStatusCard';
import { GLOBAL_HOTKEY } from '@/shared/lib/globalHotkey';
import { ManagedServicesEditor } from '@/features/settings/components/ManagedServicesEditor';
import { ServersSettingsCard } from '@/features/settings/components/ServersSettingsCard';
import { MacCleanSettingsCard } from '@/features/settings/components/MacCleanSettingsCard';
import { BlueprintCard } from '@/features/settings/components/BlueprintCard';
import { AppUpdateCard } from '@/features/settings/components/AppUpdateCard';
import { PrivacyCard } from '@/features/settings/components/PrivacyCard';
import { DiagnosticsCard } from '@/features/settings/components/DiagnosticsCard';

import { THEME_OPTIONS, LAYOUT_OPTIONS } from './SettingsPage.config';

export const SettingsPage = () => {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.settings.theme);
  const layout = useAppSelector((s) => s.settings.layout);
  const globalHotkey = useAppSelector((s) => s.settings.globalHotkey);
  const enabledModules = useEnabledModules();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto pr-1">
      <div className="mb-4 shrink-0">
        <p className="sr-caption">Features, appearance, Homebrew &amp; managed services</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 pb-8 xl:grid-cols-2">
        {/* Features selection */}
        <Panel
          title="Features"
          subtitle="Turning a feature off stops its background work right away. Your data stays — managed services, archives and history are untouched."
          className="xl:col-span-2"
        >
          <div className="mt-2">
            <FeaturePicker
              value={enabledModules}
              onChange={(next) => dispatch(setEnabledModules(next))}
            />
          </div>
        </Panel>

        {/* Appearance configuration */}
        <Panel title="Appearance" subtitle="Visual presentation and defaults">
          <div className="divide-y divide-hairline">
            <div className="flex flex-col justify-between gap-4 py-3.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 pr-2">
                <p className="text-sm font-medium text-fg">Theme</p>
                <p className="text-xs text-muted-foreground">
                  Match system, or force Frost/Smoked.
                </p>
              </div>
              <div className="flex shrink-0 items-center justify-start sm:justify-end">
                <SegmentedControl
                  ariaLabel="Theme"
                  value={theme}
                  options={THEME_OPTIONS}
                  onChange={(v) => dispatch(setTheme(v))}
                  equalWidth
                  className="w-full sm:w-[280px]"
                />
              </div>
            </div>
            <div className="flex flex-col justify-between gap-4 py-3.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 pr-2">
                <p className="text-sm font-medium text-fg">Default layout</p>
                <p className="text-xs text-muted-foreground">
                  How services are shown on the Services tab.
                </p>
              </div>
              <div className="flex shrink-0 items-center justify-start sm:justify-end">
                <SegmentedControl
                  ariaLabel="Default layout"
                  value={layout}
                  options={LAYOUT_OPTIONS}
                  onChange={(v) => dispatch(setLayout(v))}
                  equalWidth
                  className="w-full sm:w-[280px]"
                />
              </div>
            </div>
          </div>
        </Panel>

        {/* Shortcuts Panel */}
        <Panel title="Shortcuts" subtitle="System-wide hotkeys">
          <div className="flex flex-col justify-between gap-4 py-3.5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 pr-2">
              <p className="text-sm font-medium text-fg">Global toggle hotkey</p>
              <p className="text-xs text-muted-foreground">
                Show and focus Stackroost from anywhere; press again to hide.
              </p>
            </div>
            <div className="flex shrink-0 items-center justify-start gap-2 sm:justify-end">
              <span className="rounded bg-muted px-2.5 py-1 font-mono text-xs text-fg">
                {globalHotkey ? '⌃⌥Space — shows or hides Stackroost' : 'Off · ⌃⌥Space'}
              </span>
              <Button
                variant="glass"
                size="sm"
                onClick={() => dispatch(setGlobalHotkey(globalHotkey ? null : GLOBAL_HOTKEY))}
              >
                {globalHotkey ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </div>
        </Panel>

        {enabledModules.includes('homebrew') && <HomebrewStatusCard />}

        {enabledModules.includes('remote') && <ServersSettingsCard />}

        {enabledModules.includes('maclean') && <MacCleanSettingsCard />}

        <AppUpdateCard />

        <PrivacyCard />

        <DiagnosticsCard />

        <div className="xl:col-span-2">
          <BlueprintCard />
        </div>

        {enabledModules.includes('homebrew') && (
          <div className="xl:col-span-2">
            <ManagedServicesEditor />
          </div>
        )}
      </div>
    </div>
  );
};
