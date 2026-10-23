import { useEffect, type FormEvent, type ReactNode } from 'react';
import { ACCENTS, ANIMATIONS, BACKGROUNDS, THEMES } from '@/content/schema';
import { FieldErrorsProvider } from '../feedback';
import { ImageField } from '../media';
import { Notice, PageHeader, Panel, SaveBar } from '../ui';
import { useSettingsSection } from '../settingsForm';

/** Display-only swatches for the admin. The public site derives its colors from tokens in CSS. */
const SWATCH: Record<(typeof ACCENTS)[number], string> = {
  mint: '#7af0c8',
  lavender: '#b9a8ff',
  sky: '#7cc8ff',
  amber: '#ffcb6b',
  rose: '#ff9db8',
};

const THEME_LABEL: Record<(typeof THEMES)[number], string> = { dark: 'Charcoal', black: 'True black', light: 'Light' };
const BG_LABEL: Record<(typeof BACKGROUNDS)[number], string> = { orbits: 'Orbits + glow', grid: 'Grid + glow', plain: 'Plain' };
const ANIM_LABEL: Record<(typeof ANIMATIONS)[number], string> = { full: 'Full', subtle: 'Subtle (slower)', off: 'Off' };

function RadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  hint,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string; swatch?: ReactNode }[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  return (
    <fieldset className="a-fieldset">
      <legend>{legend}</legend>
      <div className="a-radios">
        {options.map((o) => (
          <label key={o.value} className={`a-radio ${value === o.value ? 'is-checked' : ''}`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.swatch}
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {hint && <p className="a-hint">{hint}</p>}
    </fieldset>
  );
}

export function AppearancePage() {
  const { draft, saver, save, guard, settings } = useSettingsSection(['accent', 'theme', 'background', 'animation', 'profileMediaId'] as const);
  const f = draft.value;

  // Live-preview unsaved choices on this page; restore the saved look when leaving.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.accent = f.accent;
    root.dataset.theme = f.theme;
    root.dataset.bg = f.background;
    root.dataset.motion = f.animation;
    return () => {
      root.dataset.accent = settings.accent;
      root.dataset.theme = settings.theme;
      root.dataset.bg = settings.background;
      root.dataset.motion = settings.animation;
    };
  }, [f.accent, f.theme, f.background, f.animation, settings]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save();
  };

  return (
    <form onSubmit={submit} noValidate>
      {guard}
      <PageHeader title="Appearance" subtitle="Only validated options are available, so the site can’t be broken by a bad setting. Changes preview here instantly and go live when saved." />
      <FieldErrorsProvider value={saver.fields}>
        {saver.error && <Notice kind="error">{saver.error.message}</Notice>}
        <Panel title="Colors">
          <RadioGroup
            legend="Accent color"
            name="accent"
            value={f.accent}
            onChange={(accent) => draft.update({ accent })}
            options={ACCENTS.map((a) => ({
              value: a,
              label: a[0]!.toUpperCase() + a.slice(1),
              swatch: <span className="a-swatch" style={{ background: SWATCH[a] }} aria-hidden="true" />,
            }))}
          />
          <RadioGroup legend="Theme" name="theme" value={f.theme} onChange={(theme) => draft.update({ theme })} options={THEMES.map((t) => ({ value: t, label: THEME_LABEL[t] }))} />
          <RadioGroup
            legend="Background"
            name="background"
            value={f.background}
            onChange={(background) => draft.update({ background })}
            options={BACKGROUNDS.map((b) => ({ value: b, label: BG_LABEL[b] }))}
          />
        </Panel>
        <Panel title="Motion">
          <RadioGroup
            legend="Animation"
            name="animation"
            value={f.animation}
            onChange={(animation) => draft.update({ animation })}
            options={ANIMATIONS.map((a) => ({ value: a, label: ANIM_LABEL[a] }))}
            hint="Visitors who ask their device to reduce motion never see animation, whatever you choose."
          />
        </Panel>
        <Panel title="Profile image">
          <ImageField label="Profile image (optional)" value={f.profileMediaId} onChange={(profileMediaId) => draft.update({ profileMediaId })} hint="Shown in the About section when that section’s “Show profile image” switch is on." />
        </Panel>
      </FieldErrorsProvider>
      <SaveBar
        dirty={draft.dirty}
        saving={saver.saving}
        error={saver.error?.message}
        onDiscard={() => {
          draft.discard();
          saver.clearError();
        }}
        saveLabel="Save appearance"
      />
    </form>
  );
}
