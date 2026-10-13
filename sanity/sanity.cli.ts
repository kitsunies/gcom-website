import { defineCliConfig } from 'sanity/cli';
import { studioEnvironment } from './environment';

export default defineCliConfig({ api: studioEnvironment(process.env) });
