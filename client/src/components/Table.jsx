
import React from 'react'
export default function Table({ columns = [], rows = [] }) {
  return (
    <div style={{overflowX:'auto'}}>
      <table style={{borderCollapse:'collapse', width:'100%'}}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{textAlign:'left', borderBottom:'1px solid #ddd', padding:8}}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map(col => (
                <td key={col.key} style={{borderBottom:'1px solid #f0f0f0', padding:8}}>
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
