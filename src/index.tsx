import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.css'
import App from './App.tsx'
import package_json from '../package.json'

let basename = ''
const homepage = (package_json as { homepage?: string }).homepage
if (homepage) {
  const homepage_url = new URL(homepage)
  basename = homepage_url.pathname
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <BrowserRouter basename={basename}>
    <Routes>
      <Route path="/">
        <Route index element={<App />} />
        <Route path="*" element={<p>No route found for current path</p>} />
      </Route>
    </Routes>
  </BrowserRouter>,
)
