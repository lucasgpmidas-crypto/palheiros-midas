import { Bar, Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend } from 'chart.js'

// União do que as quatro telas com gráfico usam. Registrar num lugar só evita
// que cada tela precise lembrar da escala certa — esquecer um registro quebra o
// gráfico em produção sem quebrar o build, e isso já é difícil de perceber aqui.
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend)

export default function GraficoMotor({ tipo, ...props }) {
  return tipo === 'line' ? <Line {...props} /> : <Bar {...props} />
}
