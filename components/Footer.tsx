'use client'

export default function Footer() {
  return (
    <footer className="bg-gray-900 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center">
          {/* Logo */}
          <div className="mb-8 md:mb-0">
            <div className="flex items-center">
              <span className="text-white font-bold text-xl font-fraunces">Pinecone</span>
              <span className="text-pine-light ml-2 text-xl font-fraunces">Pick Up Crew</span>
            </div>
            <p className="text-gray-400 mt-2">Your local pinecone pick up crew in Bend, OR</p>
          </div>

          {/* Contact Info */}
          <div className="text-center md:text-right mb-8 md:mb-0">
            <div className="text-white font-medium mb-2">Get in touch</div>
            <div className="space-y-1 text-gray-400">
              <div>📞 <a href="tel:8582205674" className="hover:text-white transition-colors">858-220-5674</a></div>
              <div>✉️ <a href="mailto:pinecone.pickup.crew@gmail.com" className="hover:text-white transition-colors">pinecone.pickup.crew@gmail.com</a></div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex flex-col space-y-2 text-gray-400 text-center md:text-right">
            <button
              onClick={() => {
                const element = document.getElementById('pricing')
                element?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="hover:text-white transition-colors"
            >
              Pricing
            </button>
            <button
              onClick={() => {
                const element = document.getElementById('booking')
                element?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="hover:text-white transition-colors"
            >
              Book Now
            </button>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-800 pt-8 mt-8 text-center text-gray-400 text-sm">
          <p>&copy; 2026 Pinecone Pick Up Crew. Making Bend yards pinecone-free, one pick up at a time.</p>
        </div>
      </div>
    </footer>
  )
}