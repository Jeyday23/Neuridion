'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

function Hero() {
  const [titleNumber, setTitleNumber] = useState(0)
  const titles = useMemo(
    () => ['reliable', 'audit-ready', 'efficient', 'compliant', 'thorough'],
    [],
  )

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setTitleNumber(titleNumber === titles.length - 1 ? 0 : titleNumber + 1)
    }, 2000)
    return () => clearTimeout(timeoutId)
  }, [titleNumber, titles])

  return (
    <div className="w-full">
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex gap-6 py-16 lg:py-20 items-center justify-center flex-col">
          <div>
            <span className="inline-block px-4 py-1.5 bg-[#CCFBF1] text-[#115E59] text-sm font-semibold rounded-full border border-[#0D9488]">
              EU MDR Article 83 compliant
            </span>
          </div>
          <div className="flex gap-4 flex-col">
            <h1 className="text-4xl md:text-6xl lg:text-7xl max-w-3xl tracking-tight text-center font-bold">
              <span className="text-[#0F1F3D]">
                Post-Market Surveillance
                <br />
                that&apos;s
              </span>
              <span className="relative flex w-full justify-center overflow-hidden text-center md:pb-4 md:pt-1">
                &nbsp;
                {titles.map((title, index) => (
                  <motion.span
                    key={index}
                    className="absolute font-bold text-[#0D9488]"
                    initial={{ opacity: 0, y: '-100' }}
                    transition={{ type: 'spring', stiffness: 50 }}
                    animate={
                      titleNumber === index
                        ? { y: 0, opacity: 1 }
                        : { y: titleNumber > index ? -150 : 150, opacity: 0 }
                    }
                  >
                    {title}
                  </motion.span>
                ))}
              </span>
            </h1>

            <p className="text-lg md:text-xl leading-relaxed text-[#134E4A] max-w-xl text-center mx-auto font-medium">
              Search four regulatory databases, filter Field Safety Notices with AI, and export audit-ready reports — in minutes.
            </p>
          </div>
          <div className="flex flex-row gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#0F1F3D] text-white rounded font-medium hover:bg-[#1a2d52] transition-colors text-sm"
            >
              Start 14-day free trial
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <p className="text-xs text-[#0F766E]">
            No credit card required &middot; Cancel anytime
          </p>
        </div>
      </div>
    </div>
  )
}

export { Hero }
