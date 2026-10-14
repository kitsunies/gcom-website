import { hydrateRoot, createRoot } from 'react-dom/client';
import { App } from './App';
import type { PageName } from './content';
import './style.css';

const container = document.getElementById('root')!;
const app = <App page={document.body.dataset.page as PageName} />;
if (container.hasChildNodes()) hydrateRoot(container, app);
else createRoot(container).render(app);
