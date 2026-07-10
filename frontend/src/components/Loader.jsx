import { useUIStore } from '../store/uiStore'

const Loader = ({ force = false }) => {
  const loading = useUIStore((s) => s.loading)

  if (!loading && !force) return null

  return (
    <div style={overlayStyle} aria-hidden="true">
      <div style={containerStyle}>
        <div style={spinnerStyle}>
          <div style={spinnerStyle}>
            <div style={spinnerStyle}>
              <div style={spinnerStyle}>
                <div style={spinnerStyle}>
                  <div style={spinnerInner} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.35)',
  zIndex: 9999,
}

const containerStyle = {
  width: 150,
  height: 150,
  position: 'relative',
  overflow: 'hidden',
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const spinnerStyle = {
  position: 'absolute',
  width: 'calc(100% - 9.9px)',
  height: 'calc(100% - 9.9px)',
  border: '5px solid transparent',
  borderRadius: '50%',
  borderTopColor: '#fff',
  animation: 'spin 1s linear infinite',
}

const spinnerInner = {
  width: '100%',
  height: '100%',
  border: '5px solid transparent',
  borderRadius: '50%',
  borderTopColor: '#fff',
}

// Inject keyframes globally (simple approach)
const styleEl = document.createElement('style')
styleEl.innerHTML = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`
document.head.appendChild(styleEl)

export default Loader
