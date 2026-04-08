'use client'

import Image from 'next/image'

export default function Hero() {
  const scrollToBooking = () => {
    const element = document.getElementById('booking')
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const scrollToPricing = () => {
    const element = document.getElementById('pricing')
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <section className="bg-pine py-20 px-4">
      <div className="max-w-6xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-block bg-pine-mid px-4 py-2 rounded-full mb-8">
          <span className="text-pine-light text-sm font-medium">
            Bend, OR • Weekends & After School
          </span>
        </div>

        {/* Main headline */}
        <h1 className="text-4xl md:text-6xl font-fraunces font-black mb-6 leading-tight">
          <span className="text-white">Your local </span>
          <span className="text-pine-light italic">pinecone</span>
          <span className="text-white"> pick up crew.</span>
        </h1>

        {/* Subheadline */}
        <p className="text-pine-light text-lg md:text-xl mb-8 max-w-2xl mx-auto">
          Hi, we're Bruce, Zoë and Chase — and we love to pick up pinecones! Book us online in minutes.
        </p>

        {/* Kids Photo */}
        <div className="mb-12">
          <div className="relative max-w-md mx-auto">
            <Image
              src="/images/kids-crew.jpeg"
              alt="Bruce, Zoë, and Chase with their wheelbarrow full of pinecones"
              width={400}
              height={300}
              className="rounded-2xl shadow-2xl border-4 border-white/20"
              priority
            />
            <div className="absolute -bottom-4 -right-4 bg-orange text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg">
              The Crew! 🌲
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <button
            onClick={scrollToBooking}
            className="bg-orange hover:bg-orange/90 text-white px-8 py-4 rounded-full font-medium text-lg transition-colors"
          >
            Book a Pick Up
          </button>
          <button
            onClick={scrollToPricing}
            className="border-2 border-white text-white hover:bg-white hover:text-pine px-8 py-4 rounded-full font-medium text-lg transition-colors"
          >
            See Pricing
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl mx-auto">
          <div className="text-center border-l-4 border-pine-light pl-6">
            <div className="text-3xl font-bold text-pine-light font-fraunces">$20</div>
            <div className="text-white/80 text-sm">per ¼ acre</div>
          </div>
          <div className="text-center border-l-4 border-pine-light pl-6">
            <div className="text-3xl font-bold text-pine-light font-fraunces">+$20</div>
            <div className="text-white/80 text-sm">haul away</div>
          </div>
          <div className="text-center border-l-4 border-pine-light pl-6">
            <div className="text-3xl font-bold text-pine-light font-fraunces">3</div>
            <div className="text-white/80 text-sm">kids who love this</div>
          </div>
        </div>
      </div>
    </section>
  )
}