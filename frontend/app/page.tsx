import Core from '@/components/Core'
import Footer from '@/components/Footer'
import Hero from '@/components/Hero'
import Navbar from '@/components/Navbar'
import RoleModulesPage from '@/components/Roles'
import Workflow from '@/components/Workflow'
import React from 'react'



const page = () => {
  return (
    <div>
      <Navbar />
      <Hero />
      <Core />
      <RoleModulesPage />
      <Workflow />
      <Footer />
    </div>
  )
}

export default page 




