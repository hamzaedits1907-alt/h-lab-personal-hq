import { DEMO_EMAIL, DEMO_PASSWORD } from '@/data/demoCredentials';
import { Notice } from './ui';

export default function DemoHint() {
  return (
    <Notice kind="warn">
      Demo mode. Use <code>{DEMO_EMAIL}</code> / <code>{DEMO_PASSWORD}</code>. Nothing here is secured.
    </Notice>
  );
}
