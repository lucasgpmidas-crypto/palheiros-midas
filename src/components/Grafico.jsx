import { lazy, Suspense } from 'react'

// chart.js + react-chartjs-2 somam ~166 kB. Antes vinham no mesmo pacote da tela:
// o parceiro no galpão esperava a biblioteca inteira baixar para só então ver
// quanto produziu, sendo que o gráfico fica no fim da página. Agora os números
// aparecem de imediato e o gráfico entra quando terminar de chegar.
const Motor = lazy(() => import('./GraficoMotor'))

// Ocupa a altura que o gráfico vai ocupar, para a página não pular quando chegar.
const Espaco = () => <div className="chart-skeleton" aria-hidden="true" />

export default function Grafico(props) {
  return (
    <Suspense fallback={<Espaco />}>
      <Motor {...props} />
    </Suspense>
  )
}
