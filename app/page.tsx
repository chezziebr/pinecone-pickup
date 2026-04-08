import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import HowItWorks from '@/components/HowItWorks'
import Pricing from '@/components/Pricing'
import BookingForm from '@/components/BookingForm'
import Testimonials from '@/components/Testimonials'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Hero />
      <HowItWorks />
      <Pricing />
      <BookingForm />
      <Testimonials />
      <Footer />
    </div>
  )
}
