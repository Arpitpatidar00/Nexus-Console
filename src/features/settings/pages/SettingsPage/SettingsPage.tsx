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
import { ManagedServicesEditor } from '@/features/settings/components/ManagedServicesEditor';
import { ServersSettingsCard } from '@/features/settings/components/ServersSettingsCard';
import { MacCleanSettingsCard } from '@/features/settings/components/MacCleanSettingsCard';
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
            <div className="flex items-center justify-between gap-4 py-3.5">
              <div>
                <p className="text-sm font-medium text-foreground">Theme</p>
                <p className="text-xs text-muted-foreground">
                  Match system, or force Frost/Smoked.
                </p>
              </div>
              <SegmentedControl
                ariaLabel="Theme"
                value={theme}
                options={THEME_OPTIONS}
                onChange={(v) => dispatch(setTheme(v))}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-3.5">
              <div>
                <p className="text-sm font-medium text-foreground">Default layout</p>
                <p className="text-xs text-muted-foreground">
                  How services are shown on the Services tab.
                </p>
              </div>
              <SegmentedControl
                ariaLabel="Default layout"
                value={layout}
                options={LAYOUT_OPTIONS}
                onChange={(v) => dispatch(setLayout(v))}
              />
            </div>
          </div>
        </Panel>

        {/* Shortcuts Panel */}
        <Panel title="Shortcuts" subtitle="System-wide hotkeys">
          <div className="flex items-center justify-between gap-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">Global toggle hotkey</p>
              <p className="text-xs text-muted-foreground">
                Show and focus Stackroost from anywhere; press again to hide.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-muted px-2.5 py-1 font-mono text-xs text-foreground">
                {globalHotkey ?? 'Unset (Ctrl+Option+Space)'}
              </span>
              <Button
                variant="glass"
                size="sm"
                onClick={() =>
                  dispatch(setGlobalHotkey(globalHotkey ? null : 'CommandOrControl+Alt+Space'))
                }
              >
                {globalHotkey ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </div>
        </Panel>

        <HomebrewStatusCard />

        {enabledModules.includes('remote') && <ServersSettingsCard />}

        {enabledModules.includes('maclean') && <MacCleanSettingsCard />}

        <div className="xl:col-span-2">
          <ManagedServicesEditor />
        </div>
      </div>
    </div>
  );
};
