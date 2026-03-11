# frozen_string_literal: true

module Searchable
  extend ActiveSupport::Concern

  included do
    searchkick word_start: [:name, :email],
               callbacks: :async
  end

  class_methods do
    def search_by(query, options = {})
      search(query, {
        fields: [:name, :email],
        match: :word_start,
        misspellings: { below: 5 }
      }.merge(options))
    end
  end

  def search_data
    {
      name: try(:name) || try(:username),
      email: try(:email)
    }
  end
end
