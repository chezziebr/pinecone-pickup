export default function Pricing() {
  return (
    <section id="pricing" className="py-20 px-4 bg-white">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-block bg-orange/10 text-orange px-3 py-1 rounded-full text-sm font-medium mb-4">
            Pricing
          </div>
          <h2 className="text-3xl md:text-4xl font-fraunces font-bold text-pine mb-4">
            Simple, fair pricing.
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Priced per quarter acre. No hidden fees, no surprises.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Pick Up Only */}
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4">🌲</div>
            <h3 className="text-2xl font-fraunces font-bold text-pine mb-2">
              Pick Up Only
            </h3>
            <div className="text-4xl font-fraunces font-bold text-pine mb-4">
              $20<span className="text-lg font-normal text-gray-500">/¼ acre</span>
            </div>
            <p className="text-gray-600 mb-6">
              We collect all the pinecones and leave them neatly piled for you to dispose of.
            </p>
            <ul className="text-left space-y-2 text-gray-600">
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Complete pinecone collection
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Neatly organized pile
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                You handle disposal
              </li>
            </ul>
          </div>

          {/* Pick Up + Haul Away - Featured */}
          <div className="bg-white border-2 border-orange rounded-2xl p-8 text-center relative">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="bg-orange text-white px-4 py-1 rounded-full text-sm font-medium">
                Most Popular
              </span>
            </div>
            <div className="text-4xl mb-4">🚛</div>
            <h3 className="text-2xl font-fraunces font-bold text-pine mb-2">
              Pick Up + Haul Away
            </h3>
            <div className="text-4xl font-fraunces font-bold text-pine mb-4">
              $40<span className="text-lg font-normal text-gray-500">/¼ acre</span>
            </div>
            <p className="text-gray-600 mb-6">
              Complete service — we collect the pinecones and take them away. Zero work for you!
            </p>
            <ul className="text-left space-y-2 text-gray-600">
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Complete pinecone collection
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Full haul-away service
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Zero cleanup for you
              </li>
            </ul>
          </div>
        </div>

        {/* Additional info */}
        <div className="text-center mt-12">
          <p className="text-gray-600">
            Lot sizes: ¼ acre, ½ acre (2 units), ¾ acre (3 units), 1+ acre (4 units)
          </p>
        </div>
      </div>
    </section>
  )
}