/* @refresh reload */
import { render } from 'solid-js/web';
import { inject } from '@vercel/analytics';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/shell.css';
import './styles/urlbar.css';
import './styles/config.css';
import './styles/panels.css';
import './styles/chat.css';
import './styles/inspector.css';
import './styles/widgets.css';
import './styles/code.css';
import './styles/modal.css';

inject({ mode: import.meta.env.PROD ? 'production' : 'development' });

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

render(() => <App />, root);
