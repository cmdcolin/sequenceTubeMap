import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.css'
import App from './App'
import package_json from '../package.json'

let basename = ''
if (package_json.homepage) {
  const homepage_url = new URL(package_json.homepage)
  basename = homepage_url.pathname
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={basename}>
    <Routes>
      <Route path="/">
        <Route index element={<App />} />
        <Route path="*" element={<p>No route found for current path</p>} />
      </Route>
    </Routes>
  </BrowserRouter>,
)
