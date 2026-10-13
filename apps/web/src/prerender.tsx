import { renderToString } from 'react-dom/server';
import { App } from './App';
import type { PageName } from './content';

export const render = (page: PageName) => renderToString(<App page={page} />);
