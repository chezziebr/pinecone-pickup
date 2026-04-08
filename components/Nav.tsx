'use client'

export default function Nav() {
  const scrollToBooking = () => {
    const element = document.getElementById('booking')
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <nav className="sticky top-0 z-50 bg-pine px-4 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-white font-bold text-xl font-fraunces">Pinecone</span>
          <span className="text-pine-light ml-2 text-xl font-fraunces">Pick Up Crew</span>
        </div>
        <button
          onClick={scrollToBooking}
          className="bg-orange hover:bg-orange/90 text-white px-6 py-2 rounded-full font-medium transition-colors"
        >
          Schedule a Pick Up
        </button>
      </div>
    </nav>
  )
}