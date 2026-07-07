import { useRef, useEffect, useState } from 'react'
import { X, RotateCcw } from 'lucide-react'

const SignatureCanvas = ({ onSave, onClose, title = 'Sign Here' }) => {
  const canvasRef = useRef(null)
  const isDrawingRef = useRef(false)
  const [hasSignature, setHasSignature] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const startDrawing = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    
    // Use requestAnimationFrame to ensure DOM is ready before measuring
    requestAnimationFrame(() => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      
      ctx.beginPath()
      ctx.moveTo(x, y)
      canvas.setPointerCapture?.(e.pointerId)
      isDrawingRef.current = true
    })
  }

  const draw = (e) => {
    if (!isDrawingRef.current) return
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    
    // Use requestAnimationFrame to ensure DOM is ready before measuring
    requestAnimationFrame(() => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      
      ctx.lineTo(x, y)
      ctx.stroke()
      setHasSignature(true)
    })
  }

  const stopDrawing = () => {
    isDrawingRef.current = false
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const signatureImage = canvas.toDataURL('image/png')
    onSave(signatureImage)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            aria-label="Close signature dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="p-6">
          <div className="mb-4 rounded-lg border-2 border-dashed border-gray-300 bg-white dark:border-gray-700">
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              className="w-full cursor-crosshair"
              style={{ touchAction: 'none' }}
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerLeave={stopDrawing}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <button
              onClick={clear}
              className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              <RotateCcw className="h-4 w-4" />
              Clear
            </button>
            
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!hasSignature}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-700"
              >
                Save Signature
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SignatureCanvas

