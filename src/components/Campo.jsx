import { cloneElement, useId } from 'react'

// Rótulo e campo estavam lado a lado, sem ligação nenhuma entre os dois. Visualmente
// parecia certo, mas tocar no rótulo não fazia nada — no celular do galpão isso é
// alvo de toque desperdiçado bem em cima do campo — e o leitor de tela anunciava
// "caixa de texto" sem dizer de quê.
//
// O id vem do useId() do React em vez de ser escrito à mão: vários destes campos
// são renderizados dentro de listas, e id repetido na mesma tela faz o rótulo
// apontar para o campo errado — que é pior do que não apontar para nenhum.
export default function Campo({ label, children, className = 'fg', ...resto }) {
  const id = useId()
  return (
    <div className={className} {...resto}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  )
}
