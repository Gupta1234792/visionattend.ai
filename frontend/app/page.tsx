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
      <section id="home"><Hero /></section>
      <section id="features"><Core /></section>
      <section id="roles"><RoleModulesPage /></section>
      <section id="workflow"><Workflow /></section>
      <section id="about"><Footer /></section>
      <section id="contact" className="hidden" />
    </div>
  )
}

export default page 



