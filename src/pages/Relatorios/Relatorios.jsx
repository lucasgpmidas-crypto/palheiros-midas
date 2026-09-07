import { useState } from 'react'
import { useFuncionarios, useConfig } from '../../lib/hooks'
import TabDiario from './TabDiario'
import TabSemanal from './TabSemanal'
import TabMensal from './TabMensal'
import TabIndividual from './TabIndividual'
import TabFolha from './TabFolha'

const TABS = [['diario', 'Diário'], ['semanal', 'Semanal'], ['mensal', 'Mensal'], ['individual', 'Individual'], ['folha', '💰 Folha']]

export default function Relatorios() {
  const [aba, setAba] = useState('diario')
  const { funcionarios } = useFuncionarios()
  const { valorMil } = useConfig()
  return (
    <div>
      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={`tab ${aba === id ? 'active' : ''}`} onClick={() => setAba(id)}>{label}</button>
        ))}
      </div>
      {aba === 'diario'     && <TabDiario     funcionarios={funcionarios} valorMil={valorMil} />}
      {aba === 'semanal'    && <TabSemanal    funcionarios={funcionarios} valorMil={valorMil} />}
      {aba === 'mensal'     && <TabMensal     funcionarios={funcionarios} valorMil={valorMil} />}
      {aba === 'individual' && <TabIndividual funcionarios={funcionarios} valorMil={valorMil} />}
      {aba === 'folha'      && <TabFolha      funcionarios={funcionarios} valorMil={valorMil} />}
    </div>
  )
}
