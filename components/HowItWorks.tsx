export default function HowItWorks() {
  const steps = [
    {
      number: 1,
      title: "Book online",
      description: "Pick a time that works. You'll get an instant confirmation and reminders before we arrive."
    },
    {
      number: 2,
      title: "We show up",
      description: "Bruce, Zoë, and Chase arrive ready to work. We handle everything — you don't lift a finger."
    },
    {
      number: 3,
      title: "Yard is clear",
      description: "Pick up complete. Optional haul-away means zero cleanup left for you."
    }
  ]

  return (
    <section className="py-20 px-4 bg-cream">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-block bg-orange/10 text-orange px-3 py-1 rounded-full text-sm font-medium mb-4">
            How it works
          </div>
          <h2 className="text-3xl md:text-4xl font-fraunces font-bold text-pine mb-4">
            Simple as 1, 2, 3.
          </h2>
        </div>

        {/* Steps grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div key={step.number} className="text-center">
              <div className="w-12 h-12 bg-pine text-white rounded-full flex items-center justify-center text-xl font-bold font-fraunces mb-4 mx-auto">
                {step.number}
              </div>
              <h3 className="text-xl font-fraunces font-bold text-pine mb-3">
                {step.title}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}