import { useEffect, useId, useRef } from 'react'

export default function Modal({ title, onClose, children, width = 520 }) {
  const caixa = useRef(null)
  const tituloId = useId()

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  // Ao abrir, o foco vai para o modal; ao fechar, volta para o botão que o abriu.
  // Sem isso o Tab continuava de onde estava na página atrás, e quem navega por
  // teclado passeava pela tela de baixo achando que estava dentro do modal.
  useEffect(() => {
    const anterior = document.activeElement
    caixa.current?.focus()
    return () => anterior?.focus?.()
  }, [])

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className="modal"
        style={{ width, maxWidth: '95vw' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        ref={caixa}
      >
        <div className="modal-header">
          <div className="modal-title" id={tituloId}>{title}</div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
