import { motion } from 'framer-motion'
import { MessageCircle, X } from 'lucide-react'
import { SynzinAvatar } from './SynzinAvatar'

export function SynzinHelpPrompt({ isOpen, onAsk, onDismiss, onOpen }) {
  if (!isOpen) {
    return (
      <motion.button
        type="button"
        onClick={onOpen}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.5, scale: 1 }}
        whileHover={{ opacity: 1, scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="fixed bottom-11 right-11 z-40 inline-flex h-16 w-16 items-center justify-center rounded-full border border-orange-100 bg-white shadow-lg shadow-slate-900/10 dark:border-[#5a4635] dark:bg-[rgb(29_24_19)]"
        aria-label="Open Synzin AI help"
      >
        <SynzinAvatar size="sm" />
      </motion.button>
    )
  }

  return (
    <motion.aside
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="fixed bottom-5 right-5 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-orange-100 bg-white p-4 shadow-2xl shadow-slate-900/12 dark:border-[#5a4635] dark:bg-[rgb(29_24_19)]"
      aria-label="Synzin AI help prompt"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-100"
        aria-label="Dismiss Synzin help prompt"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex gap-3 pr-8">
        <SynzinAvatar size="lg" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-950 dark:text-gray-50">Synzin can help</p>
          <p className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-300">
            Ask AI about tasks, CRM, HR, projects, blockers, or reports.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onAsk}
        className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700"
      >
        <MessageCircle className="h-4 w-4" />
        Ask Synzin
      </button>
    </motion.aside>
  )
}
