import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppError } from '@/data/errors';
import { createRepository } from '@/app/RepositoryContext';
import { ErrorState } from '@/site/SitePage';
import './styles/global.css';
import './styles/site.css';

const root = createRoot(document.getElementById('root')!);

createRepository().then((repository) => {
  root.render(
    <StrictMode>
      {repository instanceof AppError ? (
        <ErrorState title="Not configured yet" message={repository.message} />
      ) : (
        <App repository={repository} />
      )}
    </StrictMode>,
  );
});
