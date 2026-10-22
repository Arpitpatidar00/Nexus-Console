import { useEffect, useState } from 'react';
import { Boxes, Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  DEFAULT_MODULES,
  availableModules,
  useClaudeInstalled,
  visibleTabs,
  type ModuleId,
} from '@/shared/modules';
import { useAppDispatch } from '@/shared/state/hooks';
import { setEnabledModules } from '@/shared/state/settingsSlice';
import { setActiveTab } from '@/shared/state/uiSlice';
import { Button } from '@/shared/ui/Button';
import { useDetectedTools } from '@/shared/tools';
// Deep import, not the feature barrel: the barrel pulls SettingsPage (and with it
// the whole settings graph) into this screen's chunk.
import { FeaturePicker } from '@/features/settings/components/FeaturePicker';
import { PRESETS, suggestModules } from './WelcomeScreen.config';

/** First launch only (`settings.enabledModules === null`). One screen, one
 * question, skippable in a single keystroke — deliberately not a wizard.
 *
 * Starts with non-opt-in modules switched ON; opt-in modules are offered in
 * their own section. */
export const WelcomeScreen = () => {
  const dispatch = useAppDispatch();
  const claudeInstalled = useClaudeInstalled();
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<ModuleId[]>(() =>
    availableModules(DEFAULT_MODULES, { claudeInstalled }),
  );
  // Path checks only, nothing runs (PLAN F.3); detection pre-selects once.
  const tools = useDetectedTools();
  const installed = (tools.data ?? []).filter((t) => t.installed);
  const [suggested, setSuggested] = useState(false);
  useEffect(() => {
    if (suggested || !tools.data) return;
    setSuggested(true);
    setSelected(availableModules(suggestModules(installed.map((t) => t.id)), { claudeInstalled }));
  }, [tools.data, suggested, installed, claudeInstalled]);

  const handleContinue = () => {
    dispatch(setEnabledModules(selected));
    // Servers chosen → straight to its consent + SSH-host import; otherwise Home.
    dispatch(setActiveTab(selected.includes('remote') ? 'servers' : visibleTabs(selected)[0]));
  };

  // Enter continues. (Digit toggles were dropped: they indexed MODULES while the
  // picker shows modules grouped, so "3" toggled a different card than the
  // third one on screen, and 10+ couldn't be typed at all.)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') handleContinue();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 4 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.18, delay, ease: [0.2, 0, 0, 1] as const },
        };

  return (
    <div className="flex h-screen w-screen flex-col overflow-auto bg-canvas text-fg">
      <div data-tauri-drag-region className="h-7 w-full shrink-0" />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-8 py-10">
        <motion.header {...rise(0)} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ember-soft text-ember-text">
              <Boxes className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium text-fg-muted">Stackroost</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Choose what you&rsquo;ll use
          </h1>
          <p className="max-w-prose text-sm text-fg-muted">
            Stackroost only runs the parts you switch on. Change this any time in Settings — nothing
            is deleted.
          </p>
        </motion.header>

        {installed.length > 0 && (
          <motion.div {...rise(0.03)} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-fg-muted">Found on this Mac:</span>
            {installed.map((t) => (
              <span
                key={t.id}
                className="flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-success"
              >
                <Check className="size-3" /> {t.label}
              </span>
            ))}
            <span className="text-fg-subtle">— matching modules are switched on below.</span>
          </motion.div>
        )}

        <motion.div {...rise(0.06)} className="flex flex-wrap gap-2">
          {PRESETS.filter((p) => availableModules(p.modules, { claudeInstalled }).length > 0).map(
            (p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setSelected(availableModules(p.modules, { claudeInstalled }))}
                className="rounded-md border border-border bg-paper px-2.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-list hover:text-fg focus-visible:ring-2 focus-visible:ring-ember focus-visible:outline-none"
              >
                {p.label}
              </button>
            ),
          )}
        </motion.div>

        <motion.div {...rise(0.12)} className="flex flex-col gap-2">
          <FeaturePicker value={selected} onChange={setSelected} />
        </motion.div>

        {/* FeaturePicker already lists every module, opt-in ones included — the
            second opt-in row here showed each of them twice. */}
        {selected.includes('remote') && (
          <p className="text-xs text-fg-subtle">
            Servers next: you&rsquo;ll be asked before ~/.ssh/config is read, then pick which hosts
            to import.
          </p>
        )}

        <motion.footer {...rise(0.18)} className="flex items-center justify-between gap-4">
          <p className="text-xs text-fg-subtle">Enter to continue</p>
          <Button onClick={handleContinue}>Continue</Button>
        </motion.footer>
      </div>
    </div>
  );
};
