import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

// 默认只监听 visibilitychange；切换窗口回来（window focus）时也要刷新状态
focusManager.setEventListener((handleFocus) => {
  const onFocus = () => handleFocus(true)
  const onVisibility = () => handleFocus(document.visibilityState === 'visible')
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVisibility)
  }
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 5_000, refetchOnWindowFocus: true },
    mutations: { retry: false }
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
