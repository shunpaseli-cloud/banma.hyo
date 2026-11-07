import { useState } from 'react'
export function syncDisclosure(event,setOpen) {
  // Ignore toggle events from a nested disclosure.
  if(event.target===event.currentTarget)setOpen(event.currentTarget.open)
}
export default function Disclosure({label,children,className='',initialOpen=false}) {
  const [open,setOpen]=useState(initialOpen)
  return <details className={`disclosure ${className}`} open={open} onToggle={event=>syncDisclosure(event,setOpen)}>
    <summary>{label}</summary>
    {open&&<div className="disclosure-body">{children}</div>}
  </details>
}
