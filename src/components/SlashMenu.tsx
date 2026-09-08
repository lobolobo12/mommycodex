import { useEffect, useRef } from 'react';
import type { CommandOption } from '../commands';
export default function SlashMenu({options,selected,choose}:{options:CommandOption[];selected:number;choose:(option:CommandOption)=>void}) {
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});},[selected]);
  return <div className="slash-menu" ref={root}>
    <div className="slash-heading">Commands <span>↑↓ choose · Enter run · Esc close</span></div>
    <div role="listbox" id="slash-commands" aria-label="Slash commands">
      {options.map((option,i)=><button type="button" role="option" id={`slash-option-${i}`} aria-selected={i===selected} aria-disabled={!!option.disabled} key={option.id} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(option)}>
        <code>{option.label}</code><span>{option.disabled??option.description}</span>{option.selected&&<small>Current</small>}
      </button>)}
      {!options.length&&<p>No matching command. Edit it, or press Esc to close.</p>}
    </div>
  </div>;
}
