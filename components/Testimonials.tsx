export default function Testimonials() {
  const testimonials = [
    {
      text: "Pine cone pick up is a drag — they saved my yard and my back!",
      author: "Christine",
      location: "Awbrey Butte",
      rating: 5
    },
    {
      text: "Booked online, they showed up on time, yard was spotless. Kids are great workers.",
      author: "David",
      location: "Northwest Crossing",
      rating: 5
    },
    {
      text: "The haul-away option is worth every penny. Highly recommend!",
      author: "Sarah",
      location: "Old Bend",
      rating: 5
    }
  ]

  return (
    <section className="py-20 px-4 bg-pine">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-block bg-orange/20 text-orange px-4 py-2 rounded-full text-base font-medium mb-4">
            Reviews
          </div>
          <h2 className="text-3xl md:text-4xl font-fraunces font-bold text-white mb-4">
            What neighbors are saying.
          </h2>
        </div>

        {/* Testimonials grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div key={index} className="bg-white/5 border border-white/20 rounded-2xl p-6 backdrop-blur-sm">
              {/* Stars */}
              <div className="flex mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <span key={i} className="text-yellow-400 text-lg">★</span>
                ))}
              </div>

              {/* Quote */}
              <blockquote className="text-white mb-6 text-lg leading-relaxed">
                "{testimonial.text}"
              </blockquote>

              {/* Author */}
              <div className="text-pine-light">
                <div className="font-medium">{testimonial.author}</div>
                <div className="text-sm opacity-80">{testimonial.location}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <p className="text-pine-light text-lg">
            Ready to join these happy customers?
          </p>
        </div>
      </div>
    </section>
  )
}