import { createRoot } from 'react-dom/client';
import '@milkdown/crepe/theme/common/style.css';
import 'katex/dist/katex.min.css';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
