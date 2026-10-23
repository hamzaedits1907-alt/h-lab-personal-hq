import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router-dom';
import { App } from '@/App';
import { DEMO_EMAIL, DEMO_PASSWORD, DemoRepository, MemoryStorage } from '@/data/demoRepository';
import type { AuthState } from '@/data/repository';
import { appRoutes } from '@/routes';

export async function makeRepo(opts: { signedIn?: boolean; storage?: MemoryStorage } = {}) {
  const storage = opts.storage ?? new MemoryStorage();
  const repo = new DemoRepository(storage);
  if (opts.signedIn) await repo.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  return { repo, storage };
}

/** A repository whose session is a signed-in user who is NOT an admin. */
export class NonAdminRepository extends DemoRepository {
  override async getAuthState(): Promise<AuthState> {
    return { status: 'signed-in', userId: 'someone-else', email: 'stranger@example.com', isAdmin: false };
  }
}

export function renderAt(path: string, repo: DemoRepository) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  const utils = render(<App repository={repo} router={router} />);
  return { ...utils, router };
}

export const user = () => userEvent.setup({ applyAccept: false });

/** 16 bytes that begin with the PNG signature. */
export function tinyPng(name = 'pixel.png') {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
  return new File([bytes], name, { type: 'image/png' });
}

export const ids = {
  genius: '00000000-0000-4000-8000-000000000201',
  browser: '00000000-0000-4000-8000-000000000202',
  hero: '00000000-0000-4000-8000-000000000101',
  exploring: '00000000-0000-4000-8000-000000000104',
};
