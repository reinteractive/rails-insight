# frozen_string_literal: true

class UsersController < ApplicationController
  def index
    @pagy, @users = pagy(policy_scope(User).active, items: 25)
    authorize User
  end

  def show
    @user = User.find(params[:id])
    authorize @user
    @posts = @user.posts.published.recent.limit(10)
  end
end
