# frozen_string_literal: true

class UserMailer < ApplicationMailer
  default from: "noreply@testapp.com"

  def welcome_email(user)
    @user = user
    @login_url = new_user_session_url

    mail(
      to: @user.email,
      subject: "Welcome to TestApp!"
    )
  end

  def post_published(user, post)
    @user = user
    @post = post

    mail(
      to: @user.email,
      subject: "Your post '#{@post.title}' has been published"
    )
  end
end
