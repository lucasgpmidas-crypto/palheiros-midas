export const exportCSV = (rows, filename) => {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const exportXLSX = (sheets, filename) => {
  import('xlsx').then((XLSX) => {
    const wb = XLSX.utils.book_new()
    sheets.forEach(({ name, rows }) => {
      const ws = XLSX.utils.aoa_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, name)
    })
    XLSX.writeFile(wb, filename)
  })
}
