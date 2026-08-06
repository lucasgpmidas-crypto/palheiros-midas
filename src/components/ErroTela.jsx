import { Component } from 'react'

// Rede de proteção em volta das telas.
//
// Sem isto, um erro de render — um campo nulo num dia estranho de dados — apaga a
// página inteira: o funcionário fica com a tela branca no celular, sem mensagem e
// sem botão, sem saber se é o aparelho, a internet ou o sistema. Aqui ele vê o que
// aconteceu e consegue sair do lugar.
//
// Precisa ser classe: só componente de classe captura erro de render em React.
export default class ErroTela extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null }
  }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  componentDidCatch(erro, info) {
    // Fica no console do aparelho — é o que dá para inspecionar quando alguém avisa
    console.error('Erro na tela:', erro, info?.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children

    return (
      <div className="card" style={{ maxWidth: 520, margin: '32px auto' }}>
        <div className="card-title">Essa tela não abriu</div>
        <p style={{ fontSize: 13.5, color: 'var(--text2)', margin: '0 0 14px' }}>
          Alguma coisa deu errado ao montar a página. Seus registros não foram afetados —
          nada é perdido por causa disso.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Tentar de novo
          </button>
          <button className="btn btn-secondary" onClick={() => { window.location.href = '/' }}>
            Voltar ao início
          </button>
        </div>
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text3)' }}>
            Detalhe técnico (para mostrar ao suporte)
          </summary>
          <pre style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 8 }}>
            {String(this.state.erro?.message || this.state.erro)}
          </pre>
        </details>
      </div>
    )
  }
}
