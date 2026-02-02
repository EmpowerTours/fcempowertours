'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import type { RiderSection } from '@/lib/epk/types';

interface RiderAccordionProps {
  sections: RiderSection[];
}

export default function RiderAccordion({ sections }: RiderAccordionProps) {
  return (
    <Accordion.Root type="multiple" className="space-y-2">
      {sections.map((section, i) => (
        <Accordion.Item
          key={i}
          value={`section-${i}`}
          className="bg-[#1e293b] rounded-xl border border-white/5 overflow-hidden"
        >
          <Accordion.Trigger className="w-full flex items-center justify-between px-6 py-4 text-left group hover:bg-white/5 transition-colors">
            <span className="text-white font-medium">{section.title}</span>
            <ChevronDown className="w-4 h-4 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </Accordion.Trigger>
          <Accordion.Content className="overflow-hidden data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp">
            <ul className="px-6 pb-4 space-y-2">
              {section.items.map((item, j) => (
                <li key={j} className="text-sm text-slate-400 flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5 shrink-0">&#8226;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
